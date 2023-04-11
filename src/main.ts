import * as jimp from 'jimp'
import * as nut from '@nut-tree/nut-js'
import { Key, Region } from '@nut-tree/nut-js'
import * as path from 'path'

nut.keyboard.config.autoDelayMs = 20

const UPDATE_RATE = 10
const FINGERPRINT_COUNT = 4
const HEADER_POS = [370, 90, 1550, 120]
const FINGERPRINT_POS = [974, 157, 1320, 685]

const PARTS_POS = [
    [475, 271, 595, 391],
    [618, 271, 738, 391],
    [475, 414, 595, 535],
    [618, 414, 738, 535],
    [475, 558, 595, 680],
    [618, 558, 738, 680],
    [475, 702, 595, 823],
    [618, 702, 738, 823]
]

/**
 * take a screenshot of a certain region
 * @param bound the bound of the region
 * @returns the screenshot
 */
async function screen(bound: number[]) {
    const [x1, y1, x2, y2] = bound
    const rawScreen = await nut.screen.grabRegion(
        new Region(x1, y1, x2 - x1, y2 - y1)
    )
    return new jimp({
        data: rawScreen.data,
        width: rawScreen.width,
        height: rawScreen.height
    })
}

/**
 * compute the difference between two images
 * @param img1 the first image
 * @param img2 the second image
 * @returns a number ranging from 0 to 1, 0 means they are believed to be identical
 */
function imageSimilarity(img1: jimp, img2: jimp): number {
    return jimp.distance(img1, img2)
}

/**
 * returns the index of the smallest element of the array
 * @param array the input array
 * @returns the index
 */
function minIndex(array: number[]): number {
    let min = 0
    for (let i = 0; i < array.length; i++) {
        if (array[i] < array[min]) min = i
    }
    return min
}

/**
 * load the fill images of a number of fingerprints
 * @param count number of fingerprint
 * @returns an array of images
 */
async function loadFingerprints(count: number): Promise<jimp[]> {
    return await Promise.all(
        new Array(count)
            .fill(0)
            .map((_, i) =>
                jimp.read(
                    path.join(__dirname, '..', 'img', `${i + 1}`, 'full.png')
                )
            )
    )
}

/**
 * load the parts to check for a number of fingerprints
 * @param count number of fingerprint
 * @returns an array of array of images
 */
async function loadFingerprintParts(count: number): Promise<jimp[][]> {
    let res: jimp[][] = []
    for (let index = 0; index < count; index++) {
        res.push(
            await Promise.all(
                new Array(4) // beacause there is 4 parts to check per fingerprint
                    .fill(0)
                    .map((_, i) =>
                        jimp.read(
                            path.join(
                                __dirname,
                                '..',
                                'img',
                                `${index + 1}`,
                                `${i + 1}.png`
                            )
                        )
                    )
            )
        )
    }
    return res
}

/**
 * store the element of the input array as the diffrence between the current element and the previous one
 * @param array input array
 * @returns output array
 */
function relativeArray(array: number[]): number[] {
    let res = []
    let previous = undefined
    for (const e of array) {
        if (!previous) {
            res.push(e)
        } else {
            res.push(e - previous)
        }
        previous = e
    }
    return res
}

/**
 * returns a promise that resolves after a delay
 * @param delay the delay to wait
 * @returns a promise that resolve after the delay
 */
async function wait(delay: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, delay))
}

/**
 * press a key
 * @param key the key to press
 */
async function press(key: Key) {
    await nut.keyboard.pressKey(key)
    await nut.keyboard.releaseKey(key)
}

;(async () => {
    const width = await nut.screen.width()
    const height = await nut.screen.height()

    const headerIMG = await jimp.read(
        path.join(__dirname, '..', 'img', 'header.png')
    )

    const fingerprints = await loadFingerprints(FINGERPRINT_COUNT)
    const fingerprintsParts = await loadFingerprintParts(FINGERPRINT_COUNT)

    if (width == 1920 && height == 1080) {
        console.log('1080p detected')
        console.log('waiting for fingerprint ...')

        while (true) {
            const headerScreenshot = await screen(HEADER_POS)
            // check for hacking
            if (imageSimilarity(headerScreenshot, headerIMG) < 0.1) {
                // screen the fingerprint on the right
                const fingerprintScreenshot = await screen(FINGERPRINT_POS)
                // compare it with all known fingerprints
                const similarities = fingerprints.map(e =>
                    imageSimilarity(fingerprintScreenshot, e)
                )
                // get the index of the most similar
                const fingerprintIndex = minIndex(similarities)
                // get all the parts to check on the left
                const solutions = fingerprintsParts[fingerprintIndex]
                console.log('fingerprint detected : ', fingerprintIndex + 1)
                // screen all parts on the left
                const parts_screenshots = await Promise.all(
                    PARTS_POS.map(e => screen(e))
                )

                // get the position of the solutions in all the parts on the left
                // (this is because parts position are randomized)
                const positions: number[] = []
                for (const solution of solutions) {
                    let i = 0
                    let minI = 0
                    let minV = 1
                    for (const screenshot of parts_screenshots) {
                        if (!positions.includes(i)) {
                            const s = imageSimilarity(solution, screenshot)
                            if (s < minV) {
                                minV = s
                                minI = i
                            }
                        }
                        i++
                    }
                    positions.push(minI)
                }
                // we sort those position to get them in order, making the movements easier
                positions.sort()
                // store position as the numberof moves from the previous element to again make the movements easier
                const relativePositions = relativeArray(positions)

                // press the keys
                for (const move of relativePositions) {
                    for (let i = 0; i < move; i++) {
                        await press(Key.Right)
                    }
                    await press(Key.Enter)
                }
                await press(Key.Tab)
                console.log('validating')
                await wait(4350 - 1000 / UPDATE_RATE)
            }
            await wait(1000 / UPDATE_RATE)
        }
    } else {
        console.error('screen size not supported')
        await wait(5000)
        process.exit(0)
    }
})()

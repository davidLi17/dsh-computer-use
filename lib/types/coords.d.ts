/**
 * The model only ever sees one coordinate space: pixels of the most recent
 * screenshot of the current display. The plugin owns the conversion to
 * physical virtual-screen pixels, so the model never does scale arithmetic.
 */
export interface Display {
    /** Physical virtual-screen origin and size. */
    x: number;
    y: number;
    width: number;
    height: number;
    primary: boolean;
    dpi: number;
    name: string;
}
export interface ScreenshotLimits {
    maxLongEdge: number;
    maxPixels: number;
}
export interface Size {
    width: number;
    height: number;
}
export interface Point {
    x: number;
    y: number;
}
export interface Rect extends Point, Size {
}
/** Screenshot size for a display: fit both limits, keep aspect, never upscale. */
export declare function screenshotSize(display: Size, limits: ScreenshotLimits): Size;
/** Screenshot pixels → physical virtual-screen pixels. Throws when outside the image. */
export declare function toPhysical(point: Point, display: Display, shot: Size): Point;
/** Physical virtual-screen pixels → screenshot pixels (may fall outside for other displays). */
export declare function toScreenshot(point: Point, display: Display, shot: Size): Point;
/** Screenshot-space region [x1, y1, x2, y2] → physical rect clamped to the display. */
export declare function regionToPhysical(region: readonly number[], display: Display, shot: Size): Rect;
/** Is a physical point on this display? */
export declare function contains(display: Display, point: Point): boolean;

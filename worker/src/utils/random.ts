export class Random {
    static float(min: number, max: number): number {
        return Math.random() * (max - min + 1) + min;
    }

    static int(min: number, max: number): number {
        return Math.floor(Random.float(min, max));
    }
}

export class WatermarkService {
  async applyWatermark(inputKey: string): Promise<string> {
    return `${inputKey}-watermarked`;
  }
}

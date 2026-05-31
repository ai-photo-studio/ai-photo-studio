export class TemplateService {
  async applyStaticTemplate(inputKey: string): Promise<string> {
    return `${inputKey}-templated`;
  }
}

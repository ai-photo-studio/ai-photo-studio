import { randomUUID } from "node:crypto";
import type {
  ImageProvider,
  ProcessImageInput,
  ProcessImageOutput,
  ProductPipelineRoute,
  ProductWorkflowMode,
  VehicleWorkflowMode
} from "./provider.interface";

const clone = (buffer: Buffer) => Buffer.from(buffer);

const buildOutput = (
  providerName: ProcessImageOutput["providerName"],
  workflowType: ProcessImageOutput["workflowType"],
  workflowMode: ProcessImageOutput["workflowMode"],
  input: ProcessImageInput,
  output: { body: Buffer; contentType: string; fileName: string }
): ProcessImageOutput => ({
  buffer: clone(output.body),
  contentType: output.contentType,
  fileName: output.fileName,
  providerName,
  workflowType,
  workflowMode,
  providerRequestId: `fal-${randomUUID()}`
});

export class FalImageProvider implements ImageProvider {
  readonly name = "fal" as const;

  constructor(private readonly apiKey: string) {}

  private async removeBackground(input: { body: Buffer; contentType: string }): Promise<{ body: Buffer; contentType: string; fileName: string }> {
    const arrayBuffer = input.body.buffer.slice(input.body.byteOffset, input.body.byteOffset + input.body.byteLength) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: input.contentType });
    const formData = new FormData();
    formData.append("image", blob);
    
    const response = await fetch("https://fal.ai/api/remove-background", {
      method: "POST",
      headers: {
        "Authorization": `Key ${this.apiKey}`
      },
      body: formData as unknown as BodyInit
    });

    if (!response.ok) {
      throw new Error(`Fal API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as { image?: string };
    if (!result.image) {
      throw new Error("Fal API returned no image");
    }

    const body = Buffer.from(result.image, "base64");
    return { body, contentType: "image/png", fileName: "product-transparent.png" };
  }

  async processProductImage(
    input: ProcessImageInput & { workflowMode: ProductWorkflowMode },
    _routing?: ProductPipelineRoute
  ): Promise<ProcessImageOutput> {
    const output = await this.removeBackground({ body: input.buffer, contentType: input.contentType });
    return buildOutput(this.name, "PRODUCT", input.workflowMode, input, output);
  }

  async processVehicleImage(
    input: ProcessImageInput & { workflowMode: VehicleWorkflowMode },
    _routing?: ProductPipelineRoute
  ): Promise<ProcessImageOutput> {
    const output = await this.removeBackground({ body: input.buffer, contentType: input.contentType });
    return buildOutput(this.name, "VEHICLE", input.workflowMode, input, output);
  }
}

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import type { PriorityLevel, RequestAnalysisResult, RequestIntent, ServiceSlug } from "@kps/types";
import type { AIService, RequestAnalysisInput } from "./ai.service.interface";
import {
  REQUEST_ANALYSIS_PROMPT_VERSION,
  REQUEST_ANALYSIS_SYSTEM_PROMPT,
  REQUEST_ANALYSIS_TOOL,
  REQUEST_ANALYSIS_TOOL_NAME,
} from "./prompts/request-analysis";

const logger = new Logger("AnthropicAiService");

@Injectable()
export class AnthropicAiService implements AIService {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.client = new Anthropic({
      apiKey: config.getOrThrow<string>("ANTHROPIC_API_KEY"),
      // Backoff exponentiel intégré au SDK — au-delà, l'appelant (section 68
      // du prompt : retry → retry → échec → AI_ANALYSIS_FAILED) prend le relai.
      maxRetries: 2,
    });
    this.model = config.get<string>("ANTHROPIC_MODEL") ?? "claude-sonnet-5";
  }

  getModel(): string {
    return this.model;
  }

  getPromptVersion(): string {
    return REQUEST_ANALYSIS_PROMPT_VERSION;
  }

  async analyzeRequest(input: RequestAnalysisInput): Promise<RequestAnalysisResult> {
    const userMessage = [
      `Sujet : ${input.subject}`,
      input.originalMessage ? `Message :\n${input.originalMessage}` : null,
      input.language ? `Langue déclarée : ${input.language}` : null,
      input.country ? `Pays déclaré : ${input.country}` : null,
    ]
      .filter((line): line is string => line !== null)
      .join("\n");

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: REQUEST_ANALYSIS_SYSTEM_PROMPT,
      tools: [REQUEST_ANALYSIS_TOOL],
      // Outil forcé : on ne veut jamais reparser du texte libre, seulement
      // la sortie structurée validée par le schéma de l'outil.
      tool_choice: { type: "tool", name: REQUEST_ANALYSIS_TOOL_NAME },
      messages: [{ role: "user", content: userMessage }],
    });

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      logger.error({ stopReason: message.stop_reason }, "Claude n'a renvoyé aucun tool_use");
      throw new Error("Claude n'a pas renvoyé d'analyse structurée.");
    }

    return this.toResult(toolUse.input);
  }

  private toResult(raw: unknown): RequestAnalysisResult {
    const value = raw as Record<string, unknown>;
    return {
      intent: value.intent as RequestIntent,
      service: (value.service as ServiceSlug | null) ?? null,
      subservice: (value.subservice as string | null) ?? null,
      language: (value.language as string | null) ?? null,
      country: (value.country as string | null) ?? null,
      companyName: (value.companyName as string | null) ?? null,
      summary: typeof value.summary === "string" ? value.summary : "",
      urgency: (value.urgency as PriorityLevel | null) ?? null,
      budget: (value.budget as string | null) ?? null,
      deadline: (value.deadline as string | null) ?? null,
      missingInformation: Array.isArray(value.missingInformation)
        ? (value.missingInformation as string[])
        : [],
      confidence: typeof value.confidence === "number" ? value.confidence : 0,
      recommendedAction:
        typeof value.recommendedAction === "string" ? value.recommendedAction : "MANUAL_REVIEW",
    };
  }
}

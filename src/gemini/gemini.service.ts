import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import type { EnvironmentVariables } from '../config/environment.js';

export interface GeminiAnswer {
  answer: string;
  model: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly client: GoogleGenAI | null;
  private readonly model: string;

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {
    const apiKey = this.configService.get('GEMINI_API_KEY', { infer: true });
    this.model = this.configService.get('GEMINI_MODEL', { infer: true });
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  async ask(question: string): Promise<GeminiAnswer> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Gemini is not configured. Add GEMINI_API_KEY to .env and restart the app.',
      );
    }

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: question,
        config: {
          maxOutputTokens: 1_200,
          systemInstruction:
            'Answer the user clearly and accurately. Format the answer using Discord-compatible Markdown. You may use headings, bold, italics, lists, block quotes, links, and fenced code blocks. Avoid HTML and Markdown tables.',
        },
      });
      const answer = response.text?.trim();

      if (!answer) {
        throw new Error('Gemini returned an empty response');
      }

      return {
        answer,
        model: response.modelVersion ?? this.model,
        usage: {
          inputTokens: response.usageMetadata?.promptTokenCount ?? null,
          outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
          totalTokens: response.usageMetadata?.totalTokenCount ?? null,
        },
      };
    } catch (error) {
      const stack = error instanceof Error ? error.stack : String(error);
      this.logger.error('Gemini request failed', stack);

      throw new ServiceUnavailableException(
        'Gemini could not answer right now. Please try again shortly.',
      );
    }
  }
}

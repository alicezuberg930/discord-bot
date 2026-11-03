import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { GeminiService, type GeminiAnswer } from '../gemini/gemini.service.js';

const MAX_QUESTION_LENGTH = 4_000;

@Controller()
export class QuestionController {
  constructor(private readonly geminiService: GeminiService) {}

  @Post('question')
  async question(@Body() body: unknown): Promise<GeminiAnswer> {
    const question = this.readQuestion(body);
    return this.geminiService.ask(question);
  }

  private readQuestion(body: unknown): string {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new BadRequestException('question must be a non-empty string');
    }

    const value = (body as Record<string, unknown>).question;

    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException('question must be a non-empty string');
    }

    const question = value.trim();

    if (question.length > MAX_QUESTION_LENGTH) {
      throw new BadRequestException(
        `question must be at most ${MAX_QUESTION_LENGTH} characters`,
      );
    }

    return question;
  }
}

import { Module } from '@nestjs/common';
import { GeminiModule } from '../gemini/gemini.module.js';
import { QuestionController } from './question.controller.js';

@Module({
  imports: [GeminiModule],
  controllers: [QuestionController],
})
export class QuestionModule {}

import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { GeminiService, type GeminiAnswer } from '../gemini/gemini.service.js';
import { QuestionController } from './question.controller.js';

describe('QuestionController', () => {
  let controller: QuestionController;
  let ask: ReturnType<typeof vi.fn>;

  const answer: GeminiAnswer = {
    answer: '**Paris**',
    model: 'gemini-flash-latest',
    usage: {
      inputTokens: 7,
      outputTokens: 2,
      totalTokens: 9,
    },
  };

  beforeEach(async () => {
    ask = vi.fn().mockResolvedValue(answer);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuestionController],
      providers: [
        {
          provide: GeminiService,
          useValue: { ask },
        },
      ],
    }).compile();

    controller = module.get(QuestionController);
  });

  it('sends a trimmed question to Gemini', async () => {
    await expect(
      controller.question({ question: '  What is the capital of France?  ' }),
    ).resolves.toEqual(answer);
    expect(ask).toHaveBeenCalledWith('What is the capital of France?');
  });

  it('rejects an empty question', async () => {
    await expect(controller.question({ question: ' ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(ask).not.toHaveBeenCalled();
  });
});

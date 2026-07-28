import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { LibraryService } from './library.service';

@ApiTags('student-library')
@Controller('student')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get('library')
  @RequireStudentPermissions('student.library.use')
  overview(@CurrentStudent() principal: StudentPrincipal, @Query('q') q?: string) {
    return this.library.getOverview(principal, q);
  }

  @Get('library/collections/:id')
  @RequireStudentPermissions('student.library.use')
  getCollection(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.library.getCollection(principal, id);
  }

  @Post('library/items')
  @RequireStudentPermissions('student.library.use')
  createItem(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.library.createItem(principal, body as never);
  }

  @Get('library/items/:id')
  @RequireStudentPermissions('student.library.use')
  getItem(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.library.getItem(principal, id);
  }

  @Patch('library/items/:id/pages')
  @RequireStudentPermissions('student.library.use')
  reorderPages(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { objectIds } = body as { objectIds: string[] };
    return this.library.patchItemPages(principal, id, objectIds);
  }

  @Patch('library/items/:id/pages/:pageIndex')
  @RequireStudentPermissions('student.library.use')
  patchPageText(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Param('pageIndex', ParseIntPipe) pageIndex: number,
    @Body() body: unknown,
  ) {
    return this.library.patchPageText(principal, id, pageIndex, body);
  }

  @Post('library/items/:id/confirm-ocr')
  @RequireStudentPermissions('student.library.use')
  confirmOcr(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.library.confirmOcr(principal, id);
  }

  @Post('library/items/:id/retry')
  @RequireStudentPermissions('student.library.use')
  retry(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.library.retryIngest(principal, id);
  }

  @Delete('library/items/:id')
  @RequireStudentPermissions('student.library.use')
  deleteItem(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.library.deleteItem(principal, id);
  }

  @Post('library/collections')
  @RequireStudentPermissions('student.library.use')
  createCollection(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.library.createCollection(principal, body);
  }

  @Patch('library/collections/:id')
  @RequireStudentPermissions('student.library.use')
  patchCollection(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.library.patchCollection(principal, id, body);
  }

  @Delete('library/collections/:id')
  @RequireStudentPermissions('student.library.use')
  deleteCollection(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.library.deleteCollection(principal, id);
  }

  @Post('library/items/:id/summarize')
  @RequireStudentPermissions('student.library.use')
  summarize(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.library.summarize(principal, id);
  }

  @Post('library/items/:id/flashcards')
  @RequireStudentPermissions('student.library.use')
  flashcards(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.library.flashcards(principal, id);
  }

  @Post('library/items/:id/quiz')
  @RequireStudentPermissions('student.library.use')
  quiz(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.library.quiz(principal, id);
  }

  @Post('library/items/:id/glossary')
  @RequireStudentPermissions('student.library.use')
  glossary(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.library.glossary(principal, id);
  }

  @Post('library/items/:id/tutor')
  @RequireStudentPermissions('student.library.use')
  tutor(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.library.tutor(principal, id, body);
  }

  @Post('classes/materials/:materialId/save-to-library')
  @RequireStudentPermissions('student.library.use')
  saveFromClass(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('materialId') materialId: string,
  ) {
    return this.library.saveFromClassMaterial(principal, materialId);
  }

  @Post('library/decks/from-session')
  @RequireStudentPermissions('student.library.use')
  deckFromSession(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.library.deckFromSession(principal, body);
  }

  @Post('library/from-learn-block/note')
  @RequireStudentPermissions('student.library.use')
  noteFromLearnBlock(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.library.noteFromLearnBlock(principal, body);
  }

  @Post('library/from-learn-block/flashcard')
  @RequireStudentPermissions('student.library.use')
  flashcardFromLearnBlock(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.library.flashcardFromLearnBlock(principal, body);
  }

  @Post('library/from-learn-session/cards')
  @RequireStudentPermissions('student.library.use')
  curatedLearnCards(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.library.saveCuratedLearnCards(principal, body);
  }

  @Get('library/decks/:id')
  @RequireStudentPermissions('student.library.use')
  getDeck(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.library.getDeck(principal, id);
  }

  @Get('library/artifacts/:id')
  @RequireStudentPermissions('student.library.use')
  getArtifact(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.library.getArtifact(principal, id);
  }

  @Get('library/artifacts/:id/attempts/:attemptId')
  @RequireStudentPermissions('student.library.use')
  getQuizAttempt(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
  ) {
    return this.library.getQuizAttempt(principal, id, attemptId);
  }

  @Post('library/decks/:id/review')
  @RequireStudentPermissions('student.library.use')
  reviewDeck(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.library.reviewCard(principal, id, body);
  }

  @Patch('library/decks/:id')
  @RequireStudentPermissions('student.library.use')
  patchDeck(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.library.patchDeck(principal, id, body);
  }

  @Post('library/decks/:id/cards')
  @RequireStudentPermissions('student.library.use')
  addCard(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.library.addCard(principal, id, body);
  }

  @Patch('library/decks/:deckId/cards/:cardId')
  @RequireStudentPermissions('student.library.use')
  patchCard(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('deckId') deckId: string,
    @Param('cardId') cardId: string,
    @Body() body: unknown,
  ) {
    return this.library.patchCard(principal, deckId, cardId, body);
  }

  @Delete('library/decks/:deckId/cards/:cardId')
  @RequireStudentPermissions('student.library.use')
  deleteCard(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('deckId') deckId: string,
    @Param('cardId') cardId: string,
  ) {
    return this.library.deleteCard(principal, deckId, cardId);
  }

  @Post('library/artifacts/:id/quiz-attempt')
  @RequireStudentPermissions('student.library.use')
  quizAttempt(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.library.quizAttempt(principal, id, body);
  }
}

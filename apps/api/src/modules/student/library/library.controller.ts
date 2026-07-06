import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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

  @Post('library/items/:id/tutor')
  @RequireStudentPermissions('student.library.use')
  tutor(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.library.tutor(principal, id);
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

  @Get('library/decks/:id')
  @RequireStudentPermissions('student.library.use')
  getDeck(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.library.getDeck(principal, id);
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

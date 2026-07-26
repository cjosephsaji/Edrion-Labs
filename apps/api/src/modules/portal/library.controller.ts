import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createLibraryBookSchema,
  issueLibraryLoanSchema,
  libraryBooksListQuerySchema,
  returnLibraryLoanSchema,
  updateLibraryBookSchema,
  versionedDeleteSchema,
  type CreateLibraryBookInput,
  type IssueLibraryLoanInput,
  type LibraryBooksListQuery,
  type ReturnLibraryLoanInput,
  type UpdateLibraryBookInput,
  type VersionedDeleteInput,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from './portal.decorators';
import { LibraryService } from './library.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Library API (Phase 8) — the book catalogue + per-student loans. Same boundary as
 * the rest of the portal. Reads need library.view; mutations need library.manage. Loans are nested
 * under a book; issuing/returning re-derives the book's available copies.
 */
@ApiTags('portal-library')
@Controller('portal/library')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class LibraryController {
  constructor(private readonly service: LibraryService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  // --- books -----------------------------------------------------------------

  @Get('books')
  @RequireInstitutionPermissions('library.view')
  listBooks(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(libraryBooksListQuerySchema)) q: LibraryBooksListQuery,
  ) {
    return this.service.listBooks(this.ctx(p, s, r), q);
  }

  @Post('books')
  @RequireInstitutionPermissions('library.manage')
  createBook(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createLibraryBookSchema)) body: CreateLibraryBookInput,
  ) {
    return this.service.createBook(this.ctx(p, s, r), body);
  }

  @Patch('books/:id')
  @RequireInstitutionPermissions('library.manage')
  updateBook(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateLibraryBookSchema)) body: UpdateLibraryBookInput,
  ) {
    return this.service.updateBook(this.ctx(p, s, r), id, body);
  }

  @Delete('books/:id')
  @RequireInstitutionPermissions('library.manage')
  deleteBook(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteBook(this.ctx(p, s, r), id, body.version);
  }

  // --- loans (against a book) ------------------------------------------------

  @Get('books/:id/loans')
  @RequireInstitutionPermissions('library.view')
  listLoans(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listLoans(this.ctx(p, s, r), id);
  }

  @Post('books/:id/loans')
  @RequireInstitutionPermissions('library.manage')
  issueLoan(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(issueLibraryLoanSchema)) body: IssueLibraryLoanInput,
  ) {
    return this.service.issueLoan(this.ctx(p, s, r), id, body);
  }

  @Post('books/:id/loans/:loanId/return')
  @RequireInstitutionPermissions('library.manage')
  returnLoan(
    @Param('id') id: string,
    @Param('loanId') loanId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(returnLibraryLoanSchema)) body: ReturnLibraryLoanInput,
  ) {
    return this.service.returnLoan(this.ctx(p, s, r), id, loanId, body);
  }

  @Delete('books/:id/loans/:loanId')
  @RequireInstitutionPermissions('library.manage')
  removeLoan(
    @Param('id') id: string,
    @Param('loanId') loanId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.removeLoan(this.ctx(p, s, r), id, loanId);
  }
}

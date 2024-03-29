import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UpgradeRuneConfirmComponent } from './upgrade-rune-confirm.component';
import { MatIconModule } from '@angular/material/icon';
import { TransactionProcessingModalModule } from '../transaction-processing-modal/transaction-processing-modal.module';
import { MatButtonModule } from '@angular/material/button';
import { DirectivesModule } from 'src/app/_directives/directives.module';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ModalSectionHeaderModule } from '../modal-section-header/modal-section-header.module';
import { ArrowModule } from '../arrow/arrow.module';
import { AssetInputModule } from '../asset-input/asset-input.module';
import { BreadcrumbModule } from '../breadcrumb/breadcrumb.module';
import { NoticeModule } from '../notice/notice.module';
import { TransactionSuccessModalModule } from '../transaction-success-modal/transaction-success-modal.module';
import { TranslateModule } from '@ngx-translate/core';

@NgModule({
  declarations: [UpgradeRuneConfirmComponent],
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    TransactionProcessingModalModule,
    TransactionSuccessModalModule,
    DirectivesModule,
    MatProgressSpinnerModule,
    ArrowModule,
    AssetInputModule,
    BreadcrumbModule,
    NoticeModule,
    ModalSectionHeaderModule,
    TranslateModule,
  ],
  exports: [UpgradeRuneConfirmComponent],
})
export class UpgradeRuneConfirmModule {}

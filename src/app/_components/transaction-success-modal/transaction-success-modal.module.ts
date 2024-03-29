import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TransactionSuccessModalComponent } from './transaction-success-modal.component';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ArrowModule } from '../arrow/arrow.module';
import { AssetInputModule } from '../asset-input/asset-input.module';
import { TextFieldModule } from '../text-field/text-field.module';
import { NoticeModule } from '../notice/notice.module';
import { DoubleAssetFieldModule } from '../double-asset-field/double-asset-field.module';
import { MatSliderModule } from '@angular/material/slider';
import { TagModule } from '../tag/tag.module';
import { SuccessNoticeComponent } from '../success-notice/success-notice.component';
import { TranslateModule } from '@ngx-translate/core';

@NgModule({
  declarations: [TransactionSuccessModalComponent, SuccessNoticeComponent],
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    AssetInputModule,
    ArrowModule,
    TextFieldModule,
    NoticeModule,
    TagModule,
    DoubleAssetFieldModule,
    MatSliderModule,
    TranslateModule,
  ],
  exports: [TransactionSuccessModalComponent],
})
export class TransactionSuccessModalModule {}

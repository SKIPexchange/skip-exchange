import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApproveEthContractModalComponent } from './approve-eth-contract-modal.component';
import { NoticeModule } from '../../notice/notice.module';
import { BreadcrumbModule } from '../../breadcrumb/breadcrumb.module';
import { TagModule } from '../../tag/tag.module';
import { TranslateModule } from '@ngx-translate/core';

@NgModule({
  declarations: [ApproveEthContractModalComponent],
  imports: [
    CommonModule,
    BreadcrumbModule,
    TagModule,
    NoticeModule,
    TranslateModule,
  ],
  exports: [ApproveEthContractModalComponent],
})
export class ApproveEthContractModalModule {}

import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Asset } from '@xchainjs/xchain-util';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/internal/operators/take';
import { CopyService } from 'src/app/_services/copy.service';
import { LayoutObserverService } from 'src/app/_services/layout-observer.service';

export type noticeData = {
  copy: string;
  show: string;
  url: string;
  thorUrl?: string;
  asset: Asset;
  isPending?: boolean;
  copyText?: string;
};

@Component({
  selector: 'app-success-notice',
  templateUrl: './success-notice.component.html',
  styleUrls: ['./success-notice.component.scss'],
})
export class SuccessNoticeComponent implements OnDestroy {
  @Input() data: noticeData[];
  isMobile: boolean;
  sub: Subscription;
  copyText: string[];

  constructor(
    private copyService: CopyService,
    private layout: LayoutObserverService
  ) {
    this.sub = this.layout.isMobile.pipe(take(1)).subscribe((res) => {
      this.isMobile = res;
    });
  }

  copyClipboard(clip: string, index) {
    this.data[index].copyText = 'Copied';
    this.copyService.copyToClipboard(clip);
    setTimeout(() => {
      this.data[index].copyText = 'Copy';
    }, 3000);
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }
}

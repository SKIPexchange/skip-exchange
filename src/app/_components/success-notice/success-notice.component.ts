import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Asset } from '@xchainjs/xchain-util';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/internal/operators/take';
import { AnalyticsService, assetString } from 'src/app/_services/analytics.service';
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
  tagCategory?: string;
  tagEvents?: string[];
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
    private layout: LayoutObserverService,
    private analytics: AnalyticsService
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
    this.analytics.event(
      this.data[index].tagCategory,
      'tag_txid_copy_*ASSET*',
      undefined,
      assetString(this.data[index].asset)
    );
  }

  ngDoCheck() {
    for (let index in this.data) {
      if (
        this.data[index] &&
        this.data[index].copy.length >= 14 &&
        this.isMobile
      ) {
        let copy = this.data[index].copy;
        // eslint-disable-next-line prettier/prettier
        this.data[index].show = copy.substring(0, 5) + '...' + copy.substring(copy.length - 5, copy.length);
      }
    }
  }

  exploreEvent(index: number) {
    this.analytics.event(
      this.data[index].tagCategory,
      'tag_txid_explore_*ASSET*',
      undefined,
      assetString(this.data[index].asset)
    );
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }
}

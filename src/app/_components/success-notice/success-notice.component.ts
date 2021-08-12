import { Component, Input, OnInit } from '@angular/core';
import { Asset } from '@xchainjs/xchain-util';
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
};

@Component({
  selector: 'app-success-notice',
  templateUrl: './success-notice.component.html',
  styleUrls: ['./success-notice.component.scss'],
})
export class SuccessNoticeComponent implements OnInit {
  @Input() data: noticeData[];
  isMobile: boolean;
  copyText: string = 'Copy';

  constructor(
    private copyService: CopyService,
    private layout: LayoutObserverService
  ) {
    const layout$ = this.layout.isMobile.pipe(take(1)).subscribe((res) => {
      this.isMobile = res;
    });
  }

  copyClipboard(clip: string) {
    this.copyText = 'Copied';
    this.copyService.copyToClipboard(clip);
    setTimeout(() => {
      this.copyText = 'Copy';
    }, 3000);
  }

  ngOnInit(): void {
    console.log(this.data);
  }
}
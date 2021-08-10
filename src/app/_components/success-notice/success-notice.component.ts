import { Component, Input, OnInit } from '@angular/core';
import { Asset } from '@xchainjs/xchain-util';
import { CopyService } from 'src/app/_services/copy.service';

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

  constructor(private copyService: CopyService) {}

  copyClipboard(clip: string) {
    this.copyService.copyToClipboard(clip);
  }

  ngOnInit(): void {
    console.log(this.data);
  }
}

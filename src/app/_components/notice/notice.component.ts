import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { LayoutObserverService } from 'src/app/_services/layout-observer.service';

@Component({
  selector: 'app-notice',
  templateUrl: './notice.component.html',
  styleUrls: ['./notice.component.scss'],
})
export class NoticeComponent implements OnInit {
  @Input() isDouble: boolean = false;
  @Input() isTag: boolean = true;
  @Input() isCenter: boolean = false;
  @Input() isMono: boolean = false;
  @Input() isGray: boolean = false;
  @Input() isDisabled: boolean = false;
  isMobile: boolean = false;

  constructor(private layout: LayoutObserverService) {
    layout.isMobile.subscribe((res) => (this.isMobile = res));
  }

  ngOnInit(): void {}
}

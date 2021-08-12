import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { Subscription } from 'rxjs';
import { LayoutObserverService } from 'src/app/_services/layout-observer.service';

@Component({
  selector: 'app-arrow',
  templateUrl: './arrow.component.html',
  styleUrls: ['./arrow.component.scss'],
})
export class ArrowComponent {
  @Input() seperator: boolean = true;
  @Input() isGrey: boolean = false;
  @Output() onClick: EventEmitter<null>;
  @Input() isPlus: boolean = false;
  @Input() isError: boolean = false;
  isMobile: boolean = false;
  sub: Subscription;

  constructor(private layout: LayoutObserverService) {
    this.onClick = new EventEmitter<null>();

    this.sub = this.layout.isMobile.subscribe((res) => {
      this.isMobile = res;
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }
}

import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';

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

  constructor() {
    this.onClick = new EventEmitter<null>();
  }
}

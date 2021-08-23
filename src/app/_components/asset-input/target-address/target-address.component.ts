import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'app-target-address',
  templateUrl: './target-address.component.html',
  styleUrls: ['./target-address.component.scss']
})
export class TargetAddressComponent implements OnInit {
  @Input() hasAddress: boolean = false;
  @Input() targetAddress: string;

  @Input() targetLabel: string;

  @Input() disabledMarketSelect: boolean;
  @Input() disableUser: boolean;

  @Output() openTargetAddress: EventEmitter<null> = new EventEmitter<null>();

  constructor() {}

  ngOnInit(): void {}

}

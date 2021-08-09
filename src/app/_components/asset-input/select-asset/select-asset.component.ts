import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Asset } from 'src/app/_classes/asset';
import { AssetAndBalance } from 'src/app/_classes/asset-and-balance';

@Component({
  selector: 'app-select-asset',
  templateUrl: './select-asset.component.html',
  styleUrls: ['./select-asset.component.scss']
})
export class SelectAssetComponent implements OnInit {
  @Input() selectedAsset: Asset;
  @Input() disabledMarketSelect: boolean;
  @Input() selectableMarkets: AssetAndBalance[];
  @Output() launchMarketsModal: EventEmitter<null> = new EventEmitter<null>();

  constructor() { }

  ngOnInit(): void {
  }

}

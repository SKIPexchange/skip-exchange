import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Asset } from '../_classes/asset';

type poolDetail = {
  poolType?: 'member' | 'notMember';
  pooledAmountRune?: number;
  pooledAmountAsset?: number;
  pooledShare?: number;
  pooledAsset?: Asset;
  pooledDayAverage?: number;
  pooledDepth?: number;
};

@Injectable({
  providedIn: 'root',
})
export class PoolDetailService {
  private pooledDetails = new BehaviorSubject<poolDetail>({});
  pooledDetails$ = this.pooledDetails.asObservable();

  private activatedAsset = new BehaviorSubject<Asset>(null);
  activatedAsset$ = this.activatedAsset.asObservable();

  constructor() {}

  getActivatedAsset() {
    return this.activatedAsset;
  }

  setActivatedAsset(val: Asset) {
    this.activatedAsset.next(val);
  }

  getPooledDeatils() {
    return this.pooledDetails;
  }

  setPooledDetails(val: poolDetail) {
    this.pooledDetails.next(val);
  }
}

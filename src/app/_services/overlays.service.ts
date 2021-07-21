import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Chain } from '@xchainjs/xchain-util';
import { BehaviorSubject } from 'rxjs';
import { AssetAndBalance } from '../_classes/asset-and-balance';

export type DepositViews =
  | 'Deposit'
  | 'Confirm'
  | 'Asset'
  | 'Approve'
  | 'Connect'
  | 'PoolType';
export type WithdrawViews = 'Withdraw' | 'Confirm' | 'Asset' | 'PoolType';
export type CreatePoolViews = 'Create' | 'Approve' | 'Asset' | 'Confirm';
export type MainViews =
  | 'Reconnect'
  | 'User Setting'
  | 'Swap'
  | 'Account Setting';
export type SwapViews =
  | 'Swap'
  | 'TargetAsset'
  | 'SourceAsset'
  | 'Connect'
  | 'Confirm'
  | 'Approve'
  | 'Update-target';
export type UserViews =
  | 'Addresses'
  | 'Address'
  | 'Asset'
  | 'Send'
  | 'Confirm'
  | 'ADDRESS_ADD_TOKEN';
export type SettingViews = 'ACCOUNT' | 'PHRASE' | 'SLIP' | 'CURRENCY';
export type PoolViews = 'Pool' | 'Connect';
export type UserOverlay = {
  userView: UserViews;
  address?: string;
  chain?: Chain;
  asset?: AssetAndBalance;
};
export enum MainViewsEnum {
  Swap = 'Swap',
  Reconnect = 'Reconnect',
  UserSetting = 'User Setting',
  AccountSetting = 'Account Setting',
  Upgrade = 'Upgrade',
  Transaction = 'Transaction',
  ReconnectXDEFI = 'ReconnectXDEFI',
}
@Injectable({
  providedIn: 'root',
})
export class OverlaysService {
  private currentViewSource = new BehaviorSubject<MainViewsEnum>(
    MainViewsEnum.Swap
  );
  currentView = this.currentViewSource.asObservable();

  private currentDepositViewSource = new BehaviorSubject<DepositViews>(
    'Deposit'
  );
  depositView = this.currentDepositViewSource.asObservable();

  private currentWithdrawViewSource = new BehaviorSubject<WithdrawViews>(
    'Withdraw'
  );
  withdrawView = this.currentWithdrawViewSource.asObservable();

  private currentCreatePoolViewSource = new BehaviorSubject<CreatePoolViews>(
    'Create'
  );
  createPoolView = this.currentCreatePoolViewSource.asObservable();

  private currentPoolViewSource = new BehaviorSubject<PoolViews>('Pool');
  PoolView = this.currentPoolViewSource.asObservable();

  private innerSwapView: SwapViews = 'Swap';

  private userViewSource = new BehaviorSubject<UserOverlay>({
    userView: 'Addresses',
  });
  innerUserView = this.userViewSource.asObservable();

  private innerSettingView: SettingViews = 'ACCOUNT';
  private innerSettingViewSwap: boolean = false;

  private showMenu: boolean = false;

  constructor(private router: Router) {}

  getMenu() {
    return this.showMenu;
  }

  setMenu(val: boolean) {
    this.showMenu = val;
  }

  getCurrentCreatePoolView() {
    return this.currentCreatePoolViewSource;
  }

  setCurrentCreatePoolView(val: CreatePoolViews) {
    this.currentCreatePoolViewSource.next(val);
  }

  getCurrentWithdrawView() {
    return this.currentWithdrawViewSource;
  }

  setCurrentWithdrawView(val: WithdrawViews) {
    this.currentWithdrawViewSource.next(val);
  }

  getCurrentDepositView() {
    return this.currentDepositViewSource;
  }

  setCurrentDepositView(val: DepositViews) {
    this.currentDepositViewSource.next(val);
  }

  getCurrentPoolView() {
    return this.currentPoolViewSource;
  }

  setCurrentPoolView(val: PoolViews) {
    this.currentPoolViewSource.next(val);
  }

  getCurrentView() {
    return this.currentViewSource;
  }

  setCurrentView(val: MainViewsEnum) {
    this.currentViewSource.next(val);
  }

  setViews(mainView: MainViewsEnum, swapView: SwapViews) {
    this.currentViewSource.next(mainView);
    this.innerSwapView = swapView;
    //if it's in deposit it will set the nav to the main page of deposit
    this.setCurrentDepositView('Deposit');
    this.setCurrentCreatePoolView('Create');
    this.setCurrentWithdrawView('Withdraw');
    // this.router.navigate(['/', 'pool']);
  }

  getCurrentSwapView() {
    return this.innerSwapView;
  }

  setCurrentSwapView(val: SwapViews) {
    this.innerSwapView = val;
  }

  getCurrentUserView() {
    return this.userViewSource;
  }

  setCurrentUserView(val: UserOverlay) {
    this.userViewSource.next(val);
  }

  getSettingViews() {
    return this.innerSettingView;
  }

  getSettingNavSwap() {
    return this.innerSettingViewSwap;
  }

  setSettingView(val: SettingViews, back?: boolean) {
    this.innerSettingView = val;
    if (back) {
      this.innerSettingViewSwap = back;
    } else {
      this.innerSettingViewSwap = false;
    }
  }

  setSettingViews(val: MainViewsEnum, inner: SettingViews, back?: boolean) {
    this.innerSettingView = inner;
    this.currentViewSource.next(val);
    if (back) {
      this.innerSettingViewSwap = back;
    } else {
      this.innerSettingViewSwap = false;
    }
  }
}

import { Injectable } from '@angular/core';
import { assetFromString, Chain } from '@xchainjs/xchain-util';
import { BehaviorSubject, of, ReplaySubject, Subject, timer } from 'rxjs';
import { catchError, switchMap, takeUntil } from 'rxjs/operators';
import { TransactionDTO } from '../_classes/transaction';
import { User } from '../_classes/user';
import { BinanceService } from './binance.service';
import { BlockchairBtcTransactionDTO, BlockchairService } from './blockchair.service';
import { MidgardService } from './midgard.service';
import { UserService } from './user.service';
import { ethers } from 'ethers';
import { environment } from 'src/environments/environment';

export const enum TxStatus {
  PENDING = 'PENDING',
  COMPLETE = 'COMPLETE'
}

export enum TxActions {
  SWAP            = 'Swap',
  DEPOSIT         = 'Deposit',
  WITHDRAW        = 'Withdraw',
  SEND            = 'Send',
  REFUND          = 'Refund',
  UPGRADE_RUNE    = 'Upgrade'
}

export interface Tx {
  chain: Chain;
  ticker: string;
  hash: string;
  status: TxStatus;
  action: TxActions;
  isThorchainTx: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class TransactionStatusService {

  private _txs: Tx[];
  private transactionSource = new BehaviorSubject<Tx[]>([]);
  txs$ = this.transactionSource.asObservable();

  killOutputsPolling: {[key: string]: Subject<void>} = {};

  killTxPolling: {[key: string]: Subject<void>} = {};
  user: User;

  ethContractApprovalSource = new ReplaySubject<string>();
  ethContractApproval$ = this.ethContractApprovalSource.asObservable();

  constructor(
    private blockchairService: BlockchairService,
    private userService: UserService,
    private midgardService: MidgardService,
    private binanceService: BinanceService
  ) {
    this._txs = [];

    userService.user$.subscribe(
      (user) => this.user = user
    );

  }

  // this needs to be simplified and cleaned up
  // only check against thorchain to see if tx is successful
  // add inputs and outputs to Tx
  addTransaction(pendingTx: Tx) {

    // remove 0x
    if (pendingTx.chain === 'ETH') {
      pendingTx.hash = pendingTx.hash.substr(2);
    }

    this._txs.unshift(pendingTx);

    if (pendingTx.status === TxStatus.PENDING) {

      this.killTxPolling[pendingTx.hash] = new Subject();

      if (pendingTx.isThorchainTx || pendingTx.chain === 'THOR') {
        this.pollThorchainTx(pendingTx.hash);
      } else {

        if (pendingTx.chain === 'BNB') {
          this.pollBnbTx(pendingTx);
        } else if (pendingTx.chain === 'BTC') {
          this.pollBtcTx(pendingTx);
        } else if (pendingTx.chain === 'ETH') {
          console.log('TODO: poll non-thorchain ETH tx. ex sending ETH out of wallet...');
          // this.pollThorchainTx(pendingTx.hash);
        }

      }

    }

    this.transactionSource.next(this._txs);
  }

  updateTxStatus(hash: string, status: TxStatus) {

    const updatedTxs = this._txs.reduce( (txs, tx) => {

      if (tx.hash === hash) {
        tx.status = status;
      }

      txs.push(tx);

      return txs;

    }, []);

    this._txs = updatedTxs;
    this.transactionSource.next(this._txs);

  }


  async pollEthContractApproval(txHash) {

    if (!this.user) {
      throw new Error('no user found polling eth contract approval');
    }

    this.killTxPolling[txHash] = new Subject();

    const infuraProjectId = environment.infuraProjectId;

    const provider = new ethers.providers.InfuraProvider(
      environment.network === 'testnet' ? 'ropsten' : 'mainnet',
      infuraProjectId
    );
    timer(0, 10000)
      .pipe(
        // This kills the request if the user closes the component
        takeUntil(this.killTxPolling[txHash]),
        // switchMap cancels the last request, if no response have been received since last tick
        switchMap(() => provider.getTransaction(txHash)),
        // catchError handles http throws
        catchError(error => of(error))
      ).subscribe( async (res: ethers.providers.TransactionResponse) => {
        console.log('pollEthContractApproval tx hash id: ', res);

        if (res.confirmations > 0) {
          this.ethContractApprovalSource.next(txHash);
          this.killTxPolling[txHash].next();
        }

      });
  }

  pollThorchainTx(hash: string) {
    timer(0, 15000)
    .pipe(
      // This kills the request if the user closes the component
      takeUntil(this.killTxPolling[hash]),
      // switchMap cancels the last request, if no response have been received since last tick
      switchMap(() => this.midgardService.getTransaction(hash)),
      // catchError handles http throws
      catchError(error => of(error))
    ).subscribe( async (res: TransactionDTO) => {

      console.log('polling tx hash id: ', hash);

      if (res.count > 0) {
        for (const resTx of res.actions) {

          // if (resTx.in[0].txID.toUpperCase() === tx.hash.toUpperCase() ) {

          // }

          if (resTx.in[0].txID.toUpperCase() === hash.toUpperCase() && resTx.status.toUpperCase() === 'SUCCESS') {
            this.updateTxStatus(hash, TxStatus.COMPLETE);
            this.userService.fetchBalances();
            this.killTxPolling[hash].next();
          } else {
            console.log('still pending...');
            console.log('resTx.in[0].txID.toUpperCase() is ', resTx.in[0].txID.toUpperCase());
            console.log('tx.hash.toUpperCase() is: ', hash.toUpperCase());
            console.log('resTx.status.toUpperCase() is: ', resTx.status.toUpperCase());
          }
        }
      }

    });
  }


  pollBtcTx(tx: Tx) {
    timer(0, 15000)
      .pipe(
        // This kills the request if the user closes the component
        takeUntil(this.killTxPolling[tx.hash]),
        // switchMap cancels the last request, if no response have been received since last tick
        switchMap(() => this.blockchairService.getBitcoinTransaction(tx.hash)),
        // catchError handles http throws
        catchError(error => of(error))
      ).subscribe( async (res: BlockchairBtcTransactionDTO) => {

        for (const key in res.data) {

          if (key.toUpperCase === tx.hash.toUpperCase) {

            if (res && res.data && res.data[key] && res.data[key].transaction
              && res.data[key].transaction.block_id && res.data[key].transaction.block_id > 0) {

                this.updateTxStatus(tx.hash, TxStatus.COMPLETE);
                this.userService.fetchBalances();
                this.killTxPolling[tx.hash].next();
            }

          }

        }

      });
  }

  pollBnbTx(tx: Tx) {

    timer(5000, 15000)
      .pipe(
        // This kills the request if the user closes the component
        takeUntil(this.killTxPolling[tx.hash]),
        // switchMap cancels the last request, if no response have been received since last tick
        // switchMap(() => this.midgardService.getTransaction(tx.hash)),
        switchMap(() => this.binanceService.getTx(tx.hash)),
        // catchError handles http throws
        catchError(error => of(error))
      ).subscribe( async (res) => {

        if (+res.code === 0) {
          this.updateTxStatus(tx.hash, TxStatus.COMPLETE);
          this.userService.fetchBalances();
          this.killTxPolling[tx.hash].next();
        }

      });
  }

  getPendingTxCount() {
    return this._txs.reduce( (count, tx) => {

      if (tx.status === TxStatus.PENDING) {
        count++;
      }

      return count;

    }, 0);
  }

}

import { Injectable } from '@angular/core';
import {
  HttpClient,
  HttpErrorResponse,
  HttpParams,
} from '@angular/common/http';
import { BehaviorSubject, Observable, timer } from 'rxjs';
import { MidgardConstants } from '../_classes/midgard-constants';
import { PoolAddressDTO } from '../_classes/pool-address';
import { TransactionDTO } from '../_classes/transaction';
import { LastBlock } from '../_classes/last-block';
import { PoolDTO } from '../_classes/pool';
import { MemberDTO } from '../_classes/member';
import { map, shareReplay } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { NetworkSummary } from '../_classes/network';
import { LiquidityProvider } from '../_classes/liquidity-provider';
import {
  MsgNativeTx,
  ThorchainDepositResponse,
} from '@xchainjs/xchain-thorchain';
import { StdTx } from '@cosmos-client/core/dist/cjs/openapi/api';
import { assetToString } from '@xchainjs/xchain-util';
// import { StdTx } from 'cosmos-client/x/auth';

export interface MimirResponse {
  [key: string]: number;
}

export interface ThornodeTx {
  observed_tx: {
    status: string;
  };
}

export interface ThorchainQueue {
  swap: number;
  outbound: number;
  internal: number;
}

declare type Coin = {
  asset: String;
  amount: string;
};

@Injectable({
  providedIn: 'root',
})
export class MidgardService {
  private v2BasePath: string;
  private _thornodeBasePath: string;
  private _constants$: Observable<MidgardConstants>;
  private _mimir$: Observable<MimirResponse>;

  private mimirSource = new BehaviorSubject<MimirResponse | HttpErrorResponse>(
    null
  );
  mimir$ = this.mimirSource.asObservable();

  private networkSource = new BehaviorSubject<
    NetworkSummary | HttpErrorResponse
  >(null);
  network$ = this.networkSource.asObservable();

  constructor(private http: HttpClient) {
    this.v2BasePath =
      environment.network === 'testnet'
        ? 'https://testnet.midgard.thorchain.info/v2'
        : 'https://midgard.thorchain.info/v2';

    this._thornodeBasePath =
      environment.network === 'testnet'
        ? 'https://testnet.thornode.thorchain.info'
        : 'https://thornode.ninerealms.com';

    // cached since constants are constant
    this._constants$ = this.http
      .get<MidgardConstants>(`${this.v2BasePath}/thorchain/constants`)
      .pipe(shareReplay());
    this._mimir$ = this.http
      .get<MimirResponse>(`${this._thornodeBasePath}/thorchain/mimir`)
      .pipe(shareReplay());
  }
  /**
   * V2 Endpoints
   *
   */

  getConstants(): Observable<MidgardConstants> {
    return this._constants$;
  }

  getLastBlock(): Observable<LastBlock[]> {
    return this.http.get<LastBlock[]>(`${this.v2BasePath}/thorchain/lastblock`);
  }

  getNetwork(): Observable<NetworkSummary> {
    return this.http.get<NetworkSummary>(`${this.v2BasePath}/network`);
  }

  setNetwork(res: NetworkSummary | HttpErrorResponse) {
    this.networkSource.next(res);
  }

  getInboundAddresses(): Observable<PoolAddressDTO[]> {
    return this.http.get<PoolAddressDTO[]>(
      `${this.v2BasePath}/thorchain/inbound_addresses`
    );
  }

  getPools(): Observable<PoolDTO[]> {
    return this.http.get<PoolDTO[]>(`${this.v2BasePath}/pools`);
  }

  getPool(asset: string): Observable<PoolDTO> {
    return this.http.get<PoolDTO>(`${this.v2BasePath}/pool/${asset}`);
  }

  getMember(address: string): Observable<MemberDTO> {
    return this.http.get<MemberDTO>(`${this.v2BasePath}/member/${address}`);
  }

  getTransaction(txId: string): Observable<TransactionDTO> {
    const params = new HttpParams()
      .set('offset', '0')
      .set('limit', '1')
      .set('txid', txId);
    return this.http.get<TransactionDTO>(`${this.v2BasePath}/actions`, {
      params,
    });
  }

  getAddrTransactions(address: string): Observable<TransactionDTO> {
    const params = new HttpParams()
      .set('offset', '0')
      .set('limit', '10')
      .set('address', address);
    return this.http.get<TransactionDTO>(`${this.v2BasePath}/actions`, {
      params,
    });
  }

  getThornodeTransaction(hash: string): Observable<ThornodeTx> {
    return this.http.get<ThornodeTx>(
      `${this._thornodeBasePath}/thorchain/tx/${hash}`
    );
  }

  getQueue(): Observable<ThorchainQueue> {
    return this.http.get<ThorchainQueue>(`${this.v2BasePath}/thorchain/queue`);
  }

  getMimir(): Observable<MimirResponse> {
    return this._mimir$;
  }

  setMimir(res: MimirResponse | HttpErrorResponse) {
    this.mimirSource.next(res);
  }

  updateMimir(): Observable<MimirResponse> {
    return this.http.get<MimirResponse>(
      `${this._thornodeBasePath}/thorchain/mimir`
    );
  }

  getThorchainLiquidityProviders(
    asset: string
  ): Observable<LiquidityProvider[]> {
    return this.http.get<LiquidityProvider[]>(
      `${this._thornodeBasePath}/thorchain/pool/${asset}/liquidity_providers`
    );
  }

  //TODO: change the result type
  buildDepositTx = async (msgNativeTx: MsgNativeTx): Promise<StdTx> => {
    try {
      //patch the coins
      let coins: Coin[] = [];
      msgNativeTx.coins.forEach(c => {
        coins.push({
          asset: assetToString(c.asset),
          amount: c.amount
        });
      });

      const response = await this.http
        .post<any>(
          `${this._thornodeBasePath}/thorchain/deposit`,
          {
            coins: coins,
            memo: msgNativeTx.memo,
            base_req: { chain_id: 'thorchain', from: msgNativeTx.signer },
          }
        )
        .toPromise();

      if (!response || !response.value) {
        throw new Error('Invalid client url');
      }

      const unsignedStdTx = {
        msg: response.value.msg,
        fee: response.value.fee,
        signatures: [],
        memo: '',
      };

      return unsignedStdTx;
    } catch (error) {
      return Promise.reject(error);
    }
  };
}

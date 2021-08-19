import { BalanceNumberPipe } from './balance-number.pipe';

describe('BalanceNumberPipe', () => {
  it('create an instance', () => {
    const pipe = new BalanceNumberPipe();
    expect(pipe).toBeTruthy();
  });
});

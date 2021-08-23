import { formatNumber } from '@angular/common';
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'balanceNumber',
})
export class BalanceNumberPipe implements PipeTransform {
  transform(number: number, ...args: any[]): any {
    if (isNaN(number)) return null; // will only work value is a number
    if (number === null) return null;
    if (number === 0) return '0';
    let digits = (number + '').replace('.', '').length;
    console.log(digits, number);

    if (digits > 10) {
      return number.toString().substring(0, 8) + '...';
    }

    return number;
  }
}

import { TestBed } from '@angular/core/testing';

import { LayoutObserverService } from './layout-observer.service';

describe('LayoutObserverService', () => {
  let service: LayoutObserverService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LayoutObserverService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

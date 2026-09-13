import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CalendarDay } from './calendar-day';

describe('CalendarDay', () => {
  let component: CalendarDay;
  let fixture: ComponentFixture<CalendarDay>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarDay],
    }).compileComponents();

    fixture = TestBed.createComponent(CalendarDay);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

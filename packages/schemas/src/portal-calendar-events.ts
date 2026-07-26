/** @deprecated — transitional re-exports. Prefer `@edrion/schemas` calendar-events exports. */
export {
  createCalendarEventSchema as createPortalCalendarEventSchema,
  updateCalendarEventSchema as updatePortalCalendarEventSchema,
  calendarEventListQuerySchema as portalCalendarListQuerySchema,
  type CreateCalendarEventInput as CreatePortalCalendarEventInput,
  type UpdateCalendarEventInput as UpdatePortalCalendarEventInput,
  type CalendarEventListQuery as PortalCalendarListQuery,
} from './calendar-events';

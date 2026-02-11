import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { createBooking, getBooking, updateBooking } from "../services/rentService";

export const bookingRouter = Router();

bookingRouter.use(requireAuth);

const createBookingSchema = z.object({
  humanId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  note: z.string().max(4000).optional()
});

bookingRouter.post("/bookings", (req, res) => {
  const payload = createBookingSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const booking = createBooking({
      userId: req.authUser!.id,
      humanId: payload.data.humanId,
      startsAt: payload.data.startsAt,
      endsAt: payload.data.endsAt,
      note: payload.data.note
    });

    return res.status(201).json({ booking });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

bookingRouter.get("/bookings/:bookingId", (req, res) => {
  const booking = getBooking(req.authUser!.id, req.params.bookingId);
  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }
  return res.json({ booking });
});

const updateBookingSchema = z.object({
  status: z.enum(["requested", "confirmed", "cancelled", "completed"]).optional(),
  note: z.string().max(4000).nullable().optional()
});

bookingRouter.patch("/bookings/:bookingId", (req, res) => {
  const payload = updateBookingSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const booking = updateBooking({
      userId: req.authUser!.id,
      bookingId: req.params.bookingId,
      status: payload.data.status,
      note: payload.data.note
    });

    return res.json({ booking });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

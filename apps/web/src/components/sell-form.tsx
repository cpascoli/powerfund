"use client";

import { useActionState, useState } from "react";
import { previewRealizedPnl, sellCashDelta } from "@powerfund/domain";

import {
  sellPosition,
  type SellActionState,
} from "@/lib/actions/sell-position";
import type { OpenPositionRow } from "@/lib/data/portfolio";

const initialState: SellActionState = { error: null };

function money(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

type Props = {
  position: OpenPositionRow;
};

export function SellForm({ position }: Props) {
  const [state, formAction, pending] = useActionState(
    sellPosition,
    initialState,
  );
  const [quantity, setQuantity] = useState(String(position.quantity));
  const [price, setPrice] = useState(
    position.markPrice != null
      ? position.markPrice.toFixed(2)
      : position.lastClose != null
        ? position.lastClose.toFixed(2)
        : "",
  );
  const [fees, setFees] = useState("0");

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const soldDefault = now.toISOString().slice(0, 16);

  const parsedQuantity = Number(quantity);
  const parsedPrice = Number(price);
  const parsedFees = Number(fees);
  const canPreview =
    Number.isFinite(parsedQuantity) &&
    parsedQuantity > 0 &&
    parsedQuantity <= position.quantity &&
    Number.isFinite(parsedPrice) &&
    parsedPrice > 0 &&
    Number.isFinite(parsedFees) &&
    parsedFees >= 0;

  const proceeds = canPreview
    ? sellCashDelta(parsedQuantity, parsedPrice, parsedFees)
    : null;
  const realized = canPreview
    ? previewRealizedPnl({
        quantity: parsedQuantity,
        price: parsedPrice,
        avgCost: position.avgCost,
        fees: parsedFees,
      })
    : null;
  const isFullExit = canPreview && parsedQuantity === position.quantity;

  return (
    <form className="research-form" action={formAction}>
      <input type="hidden" name="position_id" value={position.id} />
      <p className="muted">
        Holding{" "}
        {position.quantity.toLocaleString(undefined, {
          maximumFractionDigits: 8,
        })}{" "}
        {position.symbol} at average cost {money(position.avgCost)}. Execute at
        the broker first, then record the fill here.
      </p>

      <div className="form-row-2">
        <label>
          Units sold
          <input
            name="quantity"
            type="number"
            step="any"
            min="0"
            max={position.quantity}
            required
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        <label>
          Price per unit
          <input
            name="price"
            type="number"
            step="any"
            min="0"
            required
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="296.54"
          />
        </label>
      </div>

      <div className="form-row-2">
        <label>
          Fees (USD)
          <input
            name="fees"
            type="number"
            step="0.01"
            min="0"
            value={fees}
            onChange={(event) => setFees(event.target.value)}
          />
        </label>
        <label>
          Sold at
          <input
            name="sold_at"
            type="datetime-local"
            defaultValue={soldDefault}
            required
          />
        </label>
      </div>

      <label>
        Why
        <textarea
          name="rationale"
          rows={3}
          placeholder="What changed, or which invalidation triggered"
        />
      </label>

      <label className="checkbox-row">
        <input name="log_decision" type="checkbox" defaultChecked />
        Also log {isFullExit ? "an exit" : "a reduce"} decision in the Journal
      </label>

      {proceeds != null && realized != null ? (
        <p className="muted">
          {isFullExit ? "Closes the position. " : ""}Cash in {money(proceeds)} ·
          realized{" "}
          <span className={realized >= 0 ? "is-up" : "is-down"}>
            {money(realized)}
          </span>{" "}
          against pooled cost. Average cost is unchanged by a sale.
        </p>
      ) : null}

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Booking…" : isFullExit ? "Close position" : "Book sale"}
      </button>
    </form>
  );
}

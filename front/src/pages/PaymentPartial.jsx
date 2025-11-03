import { RefreshCcw, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function PaymentPartial() {
  return (
    <main className="bg-neutral-950 text-white min-h-screen flex items-center justify-center px-6">
      <div className="max-w-lg w-full border border-cyan-40030 rounded-2xl bg-cyan-40010 p-8 shadow-lg">
        <RefreshCcw size={48} className="text-cyan-400 mb-3" />
        <h1 className="text-2xl font-semibold mb-2">Partial Payment</h1>
        <p className="prose prose-invert text-cyan-100 mb-4">
          We received a partial payment for your crypto transaction.<br />
          Please complete the remaining amount to confirm your order.
        </p>
        <Link
          to="/checkout"
          className="inline-flex items-center gap-2 font-semibold rounded-full bg-white text-neutral-900 px-4 py-2 hover:bg-neutral-100"
        >
          <ArrowLeft size={18} />
          Back to Checkout
        </Link>
      </div>
    </main>
  );
}

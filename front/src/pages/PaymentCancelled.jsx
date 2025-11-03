import { XCircle, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function PaymentCancelled() {
  return (
    <main className="bg-neutral-950 text-white min-h-screen flex items-center justify-center px-6">
      <div className="max-w-lg w-full border border-rose-50030 rounded-2xl bg-rose-50010 p-8 shadow-lg">
        <XCircle size={48} className="text-rose-400 mb-3" />
        <h1 className="text-2xl font-semibold mb-2">Payment Cancelled</h1>
        <p className="prose prose-invert text-rose-200 mb-4">
          Your crypto payment was not completed.<br />
          You can try again or contact support if needed.
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

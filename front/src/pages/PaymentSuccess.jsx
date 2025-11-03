import { CheckCircle, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function PaymentSuccess() {
  return (
    <main className="bg-neutral-950 text-white min-h-screen flex items-center justify-center px-6">
      <div className="max-w-lg w-full border border-emerald-50030 rounded-2xl bg-emerald-50010 p-8 shadow-lg">
        <CheckCircle size={48} className="text-emerald-400 mb-3" />
        <h1 className="text-2xl font-semibold mb-2">Payment Successful!</h1>
        <p className="prose prose-invert text-emerald-200 mb-4">
          Thank you! Your crypto payment was received.<br />
          Your order will be processed soon.
        </p>
        <Link
          to="/products"
          className="inline-flex items-center gap-2 font-semibold rounded-full bg-gradient-to-r from-cyan-500 via-emerald-400 to-cyan-500 text-white px-4 py-2 hover:opacity-95"
        >
          <ArrowRight size={18} />
          Back to Shop
        </Link>
      </div>
    </main>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star } from "lucide-react";
import StarRating from "@/components/masters/StarRating";
import { accountApi, getAccountToken } from "@/lib/accountApi";
import { invalidateEntityCache } from "@/lib/cache";
import { useLanguage } from "@/contexts/LanguageContext";

type Review = {
  id: number;
  rating: number;
  comment?: string;
  reviewer_name?: string;
  created_at?: string;
};

export default function MasterReviews({
  masterId,
  onRatingChange,
  embedded = false,
}: {
  masterId: number;
  onRatingChange?: (avg: number, total: number) => void;
  embedded?: boolean;
}) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);

  const loadReviews = async (append = false) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    try {
      const skip = append ? reviews.length : 0;
      const res = await accountApi.getMasterReviews(masterId, skip);
      const items = res.items || [];
      setTotal(res.total ?? 0);
      setReviews((prev) => (append ? [...prev, ...items] : items));
      onRatingChange?.(res.avg_rating ?? 0, res.total ?? 0);
      if (getAccountToken()) {
        try {
          const mine = await accountApi.getMyMasterReview(masterId);
          setAlreadyReviewed(Boolean(mine.reviewed));
        } catch {
          setAlreadyReviewed(false);
        }
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadReviews(false);
  }, [masterId]);

  const handleSubmit = async () => {
    if (!getAccountToken()) {
      navigate("/account");
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      await accountApi.createMasterReview(masterId, { rating, comment: comment.trim() || undefined });
      setSuccess(t("masters.reviewSuccess"));
      setComment("");
      setShowForm(false);
      setAlreadyReviewed(true);
      invalidateEntityCache("masters");
      await loadReviews(false);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("уже оставляли")) setAlreadyReviewed(true);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={embedded ? '' : 'mt-10 pt-8 border-t border-gray-100 dark:border-gray-800'}>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <h3 className="font-extrabold text-gray-900 dark:text-white text-lg">
          {t("masters.reviewsTitle")} {total > 0 && <span className="text-gray-400 font-medium text-base">({total})</span>}
        </h3>
        {!alreadyReviewed && (
          <button
            type="button"
            onClick={() => {
              if (!getAccountToken()) {
                navigate("/account");
                return;
              }
              setShowForm((v) => !v);
            }}
            className="text-sm font-bold text-indigo-600 hover:text-indigo-700"
          >
            {t("masters.leaveReview")}
          </button>
        )}
        {alreadyReviewed && (
          <span className="text-sm text-green-600 font-medium">{t("masters.reviewAlready")}</span>
        )}
      </div>

      {showForm && !alreadyReviewed && (
        <div className="mb-6 rounded-2xl border border-indigo-100 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("masters.yourRating")}</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)} className="p-0.5">
                <Star className={`w-8 h-8 ${n <= rating ? "text-amber-400 fill-amber-400" : "text-gray-300"}`} />
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder={t("masters.reviewPlaceholder")}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? t("masters.submitting") : t("masters.submitReview")}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">{t("masters.loadingReviews")}</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-gray-500">{t("masters.noReviews")}</p>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <div key={r.id} className="rounded-2xl border border-gray-100 dark:border-gray-800 px-4 py-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="font-semibold text-gray-900 dark:text-white text-sm">{r.reviewer_name || t("masters.anonymousClient")}</p>
                <StarRating rating={r.rating} size="sm" />
              </div>
              {r.comment && <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{r.comment}</p>}
              {r.created_at && <p className="text-xs text-gray-400 mt-1">{r.created_at.slice(0, 10)}</p>}
            </div>
          ))}
          {reviews.length < total && (
            <button
              type="button"
              onClick={() => loadReviews(true)}
              disabled={loadingMore}
              className="text-sm font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
            >
              {loadingMore ? t("masters.loading") : t("masters.loadMore")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Phase 2 seam. The Google Business Profile connection is not built yet (see docs/decisions.md).
 * The app works without it. Anything that needs Google reviews calls this interface, and the
 * no-op implementation reports "not connected" instead of guessing.
 */
export interface GoogleReviewSource {
  name: string;
  /** Whether a live Google connection exists for this business. */
  isConnected(businessId: string): Promise<boolean>;
  /** Fetch recent reviews. Read-only. */
  listRecentReviews(businessId: string): Promise<never[]>;
  /** Post an owner reply to a review. Replies only, never edits or deletes a review. */
  postReply(businessId: string, reviewName: string, body: string): Promise<never>;
}

export const noopGoogleReviews: GoogleReviewSource = {
  name: 'not-connected',
  async isConnected() {
    return false;
  },
  async listRecentReviews() {
    return [];
  },
  async postReply() {
    throw new Error('Google Business Profile is not connected. Replies are a Phase 2 feature.');
  },
};

export function getGoogleReviewSource(): GoogleReviewSource {
  return noopGoogleReviews;
}

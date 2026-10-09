// Size and usage limits for everything that reaches OpenAI, in one place. ShipIt sends no
// conversation history to the model: each estimate is one question and each carrier reply is
// read on its own, so there is no chat-history limit (MAX_CHAT_HISTORY does not apply).
export const TOKEN_LIMITS = {
  estimateQuestionMaxChars: 500,
  carrierReplyMaxChars: 4000,
  estimateSummaryMaxTokens: 200,
  offerExtractionMaxTokens: 300,
  // How many of a user's past estimate questions the history panel shows.
  estimateHistoryItems: 20,
} as const;

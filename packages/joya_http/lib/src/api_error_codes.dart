/// API error codes.
class ApiErrorCodes {
  static const int success = 0;
  static const int unknownError = -1;
  static const int networkError = -2;
  static const int serverError = -3;
  static const int unauthorized = 401;
  static const int forbidden = 403;
  static const int notFound = 404;
  static const int validationError = 422;
  static const int rateLimit = 429;
  static const int serverMaintenance = 503;
}

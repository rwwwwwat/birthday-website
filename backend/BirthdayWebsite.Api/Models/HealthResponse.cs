namespace BirthdayWebsite.Api.Models;

// Database health is checked with SELECT 1, without exposing server details.
public sealed record HealthResponse(string Status, string Service,
    DateTimeOffset TimestampUtc, string Database);

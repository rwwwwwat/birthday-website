using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace BirthdayWebsite.Api.Security;

// Single local API process: removing a ticket invalidates captured cookie copies too.
// A process restart intentionally logs out all sessions; no database/schema is needed.
public sealed class AdminTicketStore(TimeProvider clock) : ITicketStore
{
    private readonly ConcurrentDictionary<string, AuthenticationTicket> tickets = new();
    public Task<string> StoreAsync(AuthenticationTicket ticket)
    {
        foreach (var entry in tickets)
            if (entry.Value.Properties.ExpiresUtc <= clock.GetUtcNow()) tickets.TryRemove(entry.Key, out _);
        var key = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        tickets[key] = ticket;
        return Task.FromResult(key);
    }
    public Task RenewAsync(string key, AuthenticationTicket ticket)
    { if (tickets.TryGetValue(key, out var previous)) tickets.TryUpdate(key, ticket, previous); return Task.CompletedTask; }
    public Task<AuthenticationTicket?> RetrieveAsync(string key)
    {
        if (tickets.TryGetValue(key, out var ticket) && ticket.Properties.ExpiresUtc > clock.GetUtcNow())
            return Task.FromResult<AuthenticationTicket?>(ticket);
        tickets.TryRemove(key, out _);
        return Task.FromResult<AuthenticationTicket?>(null);
    }
    public Task RemoveAsync(string key) { tickets.TryRemove(key, out _); return Task.CompletedTask; }
}

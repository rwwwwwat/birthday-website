FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/BirthdayWebsite.Api/BirthdayWebsite.Api.csproj backend/BirthdayWebsite.Api/
RUN dotnet restore backend/BirthdayWebsite.Api/BirthdayWebsite.Api.csproj
COPY backend/BirthdayWebsite.Api/ backend/BirthdayWebsite.Api/
RUN dotnet publish backend/BirthdayWebsite.Api/BirthdayWebsite.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://+:10000
EXPOSE 10000
ENTRYPOINT ["sh", "-c", "dotnet BirthdayWebsite.Api.dll --urls http://+:${PORT:-10000}"]

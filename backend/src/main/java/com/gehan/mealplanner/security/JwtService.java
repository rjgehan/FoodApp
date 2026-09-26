package com.gehan.mealplanner.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

@Service
@EnableConfigurationProperties(JwtProperties.class)
public class JwtService {

    private static final Logger log = LoggerFactory.getLogger(JwtService.class);

    /** HMAC-SHA256 keys must be at least this long (RFC 7518 §3.2). */
    private static final int MIN_SECRET_BYTES = 32;

    /**
     * How the session began, carried in the token and handed on by /refresh. Only the admin
     * pages care (see AdminAccess): a four-digit PIN that the rest of the family may well know
     * is fine for opening your own house, not for opening every house on the server. A token
     * without it — made before it existed — counts as a PIN one, the cautious way to be wrong.
     */
    private static final String SIGN_IN_CLAIM = "signin";
    private static final String BY_PASSWORD = "password";
    /** The authority JwtAuthFilter gives a request whose token says it began with a password. */
    public static final String PASSWORD_SESSION = "SIGNED_IN_WITH_PASSWORD";

    private final SecretKey key;
    private final JwtProperties properties;

    public JwtService(JwtProperties properties) {
        this.properties = properties;
        this.key = deriveKey(properties.secret());
    }

    /**
     * Hashes the configured secret to exactly 256 bits rather than using its bytes directly.
     * Feeding a short passphrase straight to hmacShaKeyFor throws WeakKeyException and the whole
     * app refuses to start — a deployment-time crash loop that says nothing about the .env file
     * that caused it. SHA-256 is deterministic, so tokens still survive a restart.
     */
    private static SecretKey deriveKey(String secret) {
        byte[] raw = secret.getBytes(StandardCharsets.UTF_8);
        if (raw.length < MIN_SECRET_BYTES) {
            log.warn("JWT_SECRET is only {} bytes. It still works, but use at least {} characters "
                    + "of random text — try: openssl rand -base64 48", raw.length, MIN_SECRET_BYTES);
        }
        try {
            return Keys.hmacShaKeyFor(MessageDigest.getInstance("SHA-256").digest(raw));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }

    /** `byPassword`: signed in with an email and password rather than a name and PIN. */
    public String generateToken(UUID userId, String username, boolean byPassword) {
        Instant now = Instant.now();
        Instant expiry = now.plus(Duration.ofMinutes(properties.expirationMinutes()));
        return Jwts.builder()
                .subject(userId.toString())
                .claim("username", username)
                .claim(SIGN_IN_CLAIM, byPassword ? BY_PASSWORD : "pin")
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiry))
                .signWith(key)
                .compact();
    }

    public UUID extractUserId(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return UUID.fromString(claims.getSubject());
    }

    public boolean signedInWithPassword(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return BY_PASSWORD.equals(claims.get(SIGN_IN_CLAIM, String.class));
    }

    /** Whether the signed-in request in hand began with a password. See PASSWORD_SESSION. */
    public static boolean signedInWithPassword(Authentication auth) {
        return auth != null && auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(PASSWORD_SESSION::equals);
    }

    public boolean isValid(String token) {
        try {
            Jwts.parser().verifyWith(key).build().parseSignedClaims(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}

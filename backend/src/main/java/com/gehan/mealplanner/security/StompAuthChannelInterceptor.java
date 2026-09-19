package com.gehan.mealplanner.security;

import com.gehan.mealplanner.repository.HouseholdMemberRepository;
import org.springframework.lang.NonNull;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Component;

import java.security.Principal;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Requires a valid JWT on the STOMP CONNECT frame so only authenticated users can open the socket,
 * and only lets them SUBSCRIBE to the households they belong to. Without the second check, any
 * signed-in account could listen to any household's grocery list — and household ids are on the
 * public sign-in screen.
 */
@Component
public class StompAuthChannelInterceptor implements ChannelInterceptor {

    private static final Pattern HOUSEHOLD_TOPIC = Pattern.compile("^/topic/households/([0-9a-fA-F-]{36})(/.*)?$");

    private final JwtService jwtService;
    private final HouseholdMemberRepository memberRepository;

    public StompAuthChannelInterceptor(JwtService jwtService, HouseholdMemberRepository memberRepository) {
        this.jwtService = jwtService;
        this.memberRepository = memberRepository;
    }

    @Override
    public Message<?> preSend(@NonNull Message<?> message, @NonNull MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) {
            return message;
        }

        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            String header = accessor.getFirstNativeHeader("Authorization");
            if (header == null || !header.startsWith("Bearer ") || !jwtService.isValid(header.substring(7))) {
                throw new IllegalArgumentException("Missing or invalid Authorization token for STOMP CONNECT");
            }
            var userId = jwtService.extractUserId(header.substring(7));
            accessor.setUser(new UsernamePasswordAuthenticationToken(userId, null, List.of()));
        }

        if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            assertMayListen(accessor.getUser(), accessor.getDestination());
        }

        return message;
    }

    private void assertMayListen(Principal user, String destination) {
        if (!(user instanceof UsernamePasswordAuthenticationToken token) || !(token.getPrincipal() instanceof UUID userId)) {
            throw new IllegalArgumentException("Not signed in");
        }
        Matcher m = destination == null ? null : HOUSEHOLD_TOPIC.matcher(destination);
        if (m == null || !m.matches()) {
            // Every topic the app publishes is per household; anything else is not for clients.
            throw new IllegalArgumentException("Unknown destination");
        }
        if (!memberRepository.existsByHouseholdIdAndUserId(UUID.fromString(m.group(1)), userId)) {
            throw new IllegalArgumentException("Not a member of this household");
        }
    }
}

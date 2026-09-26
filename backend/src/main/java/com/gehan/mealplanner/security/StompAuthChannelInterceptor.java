package com.gehan.mealplanner.security;

import com.gehan.mealplanner.repository.HouseholdMemberRepository;
import org.springframework.lang.NonNull;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Component;

import java.security.Principal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Requires a valid JWT on the STOMP CONNECT frame so only authenticated users can open the socket,
 * and only lets them SUBSCRIBE to the households they belong to. Without the second check, any
 * signed-in account could listen to any household's grocery list — and household ids are on the
 * public sign-in screen.
 *
 * Checking at SUBSCRIBE alone is not enough once an owner can take somebody out: a phone left
 * open on the grocery list would go on hearing every change until its socket dropped. So each
 * outgoing message is checked too (see {@link #mayStillHear}), against who the socket belongs to.
 */
@Component
public class StompAuthChannelInterceptor implements ChannelInterceptor {

    private static final Pattern HOUSEHOLD_TOPIC = Pattern.compile("^/topic/households/([0-9a-fA-F-]{36})(/.*)?$");

    private final JwtService jwtService;
    private final HouseholdMemberRepository memberRepository;
    /** Whose each open socket is, from its CONNECT until it goes. The broker's messages out do not say. */
    private final Map<String, UUID> userBySession = new ConcurrentHashMap<>();

    public StompAuthChannelInterceptor(JwtService jwtService, HouseholdMemberRepository memberRepository) {
        this.jwtService = jwtService;
        this.memberRepository = memberRepository;
    }

    @Override
    public Message<?> preSend(@NonNull Message<?> message, @NonNull MessageChannel channel) {
        // Also sent when a socket simply drops, without the client saying goodbye.
        if (SimpMessageHeaderAccessor.getMessageType(message.getHeaders()) == SimpMessageType.DISCONNECT) {
            String sessionId = SimpMessageHeaderAccessor.getSessionId(message.getHeaders());
            if (sessionId != null) {
                userBySession.remove(sessionId);
            }
        }

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
            if (accessor.getSessionId() != null) {
                userBySession.put(accessor.getSessionId(), userId);
            }
        }

        if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            assertMayListen(accessor.getUser(), accessor.getDestination());
        }

        return message;
    }

    /**
     * For the way out: drops a household's message on its way to somebody no longer in that
     * household. One small query per message per listener, which a family's grocery list can
     * well afford.
     */
    public ChannelInterceptor outbound() {
        return new ChannelInterceptor() {
            @Override
            public Message<?> preSend(@NonNull Message<?> message, @NonNull MessageChannel channel) {
                return mayStillHear(message) ? message : null;
            }
        };
    }

    boolean mayStillHear(Message<?> message) {
        if (SimpMessageHeaderAccessor.getMessageType(message.getHeaders()) != SimpMessageType.MESSAGE) {
            return true;
        }
        String destination = SimpMessageHeaderAccessor.getDestination(message.getHeaders());
        Matcher m = destination == null ? null : HOUSEHOLD_TOPIC.matcher(destination);
        if (m == null || !m.matches()) {
            return true;
        }
        String sessionId = SimpMessageHeaderAccessor.getSessionId(message.getHeaders());
        UUID userId = sessionId == null ? null : userBySession.get(sessionId);
        return userId != null && memberRepository.existsByHouseholdIdAndUserId(UUID.fromString(m.group(1)), userId);
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

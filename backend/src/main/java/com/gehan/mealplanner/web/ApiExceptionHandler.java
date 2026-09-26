package com.gehan.mealplanner.web;

import com.gehan.mealplanner.service.AccountService;
import org.springframework.context.support.DefaultMessageSourceResolvable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/**
 * Gives every API error the same {status, message} body. Spring's default error page omits the
 * reason, which left the UI with nothing better than the status code to show people.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleStatus(ResponseStatusException ex) {
        int status = ex.getStatusCode().value();
        String message = ex.getReason() != null ? ex.getReason() : HttpStatus.valueOf(status).getReasonPhrase();
        return ResponseEntity.status(status).body(body(status, message));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(DefaultMessageSourceResolvable::getDefaultMessage)
                .filter(Objects::nonNull)
                .findFirst()
                .orElse("That request wasn't valid.");
        return ResponseEntity.badRequest().body(body(HttpStatus.BAD_REQUEST.value(), message));
    }

    /**
     * A backstop for the one-account-per-email index. The services flush and translate this
     * themselves, but should a lost race surface at commit instead, it still reads as the
     * sentence the person can act on rather than a 500. Anything else stays a 500.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, Object>> handleIntegrity(DataIntegrityViolationException ex) {
        if (AccountService.isEmailTaken(ex)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(body(HttpStatus.CONFLICT.value(), AccountService.EMAIL_TAKEN));
        }
        throw ex;
    }

    private static Map<String, Object> body(int status, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", status);
        body.put("message", message);
        return body;
    }
}

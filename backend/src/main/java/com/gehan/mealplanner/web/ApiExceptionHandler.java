package com.gehan.mealplanner.web;

import org.springframework.context.support.DefaultMessageSourceResolvable;
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

    private static Map<String, Object> body(int status, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", status);
        body.put("message", message);
        return body;
    }
}

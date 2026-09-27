import {
  BadRequestException,
  ForbiddenException,
  type ArgumentsHost,
} from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import { AllExceptionsFilter } from "./all-exceptions.filter";

function buildHost(requestId: string | undefined) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ id: requestId, url: "/api/v1/test" }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe("AllExceptionsFilter", () => {
  const filter = new AllExceptionsFilter();

  it("garde le statut et le message d'une HttpException et ajoute le requestId", () => {
    const { host, status, json } = buildHost("req-123");

    filter.catch(new ForbiddenException("Permission insuffisante."), host);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      statusCode: 403,
      message: "Permission insuffisante.",
      error: "Forbidden",
      requestId: "req-123",
    });
  });

  it("conserve la liste des erreurs de validation", () => {
    const { host, status, json } = buildHost("req-456");

    filter.catch(
      new BadRequestException(["email must be an email", "firstName should not be empty"]),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: ["email must be an email", "firstName should not be empty"],
        requestId: "req-456",
      }),
    );
  });

  it("masque le détail d'une erreur inattendue et renvoie un 500 générique", () => {
    const { host, status, json } = buildHost("req-789");
    const errorSpy = jest
      .spyOn(filter["logger"], "error")
      .mockImplementation(() => undefined);

    filter.catch(new Error("connexion base perdue: secret interne"), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: "Erreur interne du serveur.",
      error: "Internal Server Error",
      requestId: "req-789",
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("renvoie un message clair et un libellé lisible pour un 429 (rate limiting)", () => {
    const { host, status, json } = buildHost("req-429");

    filter.catch(new ThrottlerException(), host);

    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith({
      statusCode: 429,
      message: "Trop de requêtes, réessayez plus tard.",
      error: "Too Many Requests",
      requestId: "req-429",
    });
  });

  it("renvoie requestId null quand la requête n'en porte pas", () => {
    const { host, json } = buildHost(undefined);

    filter.catch(new ForbiddenException("Non."), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: null }),
    );
  });
});
